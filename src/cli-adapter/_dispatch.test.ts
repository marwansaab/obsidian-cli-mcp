// Original — no upstream. Co-located tests for dispatchCli — argv assembly, four-priority classification, always-on bounds, atomic in-flight registry, failure-only logging (FR-008..FR-018a, FR-015a).
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UpstreamError } from "../errors.js";
import { createLogger, type Logger } from "../logger.js";
import {
  __resetInFlightRegistryForTests,
  assembleArgv,
  COLD_START_INVARIANT,
  dispatchCli,
  killInFlightChildren,
  SIGKILL_GRACE_MS,
  type DispatchInput,
  type SpawnLike,
} from "./_dispatch.js";

interface StubChildSpec {
  stdout?: string;
  stderr?: string;
  // chunkedStdout: explicit chunks (for large-output tests). When set, stdout is ignored.
  chunkedStdout?: Buffer[];
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  errorOnSpawn?: NodeJS.ErrnoException;
  // hold: never emit close on its own — wait until the test forces it via SIGTERM.
  hold?: boolean;
  // emitErrno: emit a child.on("error") with this code instead of normal exit.
  emitErrno?: NodeJS.ErrnoException["code"];
  // emitError: emit a child.on("error") with this FULL raw Error verbatim (no synthetic
  // code injection — distinct from emitErrno). Used by the form-(b) `Stream closed` retry
  // probe-shape tests where the transport error arrives as a raw Error, not an UpstreamError.
  emitError?: Error;
}

interface SpawnRecording {
  binary: string;
  argv: string[];
  options: SpawnOptions;
  child: EventEmitter & { stdout: Readable; stderr: Readable; kill: (signal?: NodeJS.Signals) => boolean; pid?: number };
}

function makeStubSpawn(spec: StubChildSpec): { spawnFn: SpawnLike; recorded: SpawnRecording[] } {
  const recorded: SpawnRecording[] = [];
  const spawnFn: SpawnLike = (binary, argv, options) => {
    if (spec.errorOnSpawn) {
      throw spec.errorOnSpawn;
    }
    const child = new EventEmitter() as EventEmitter & {
      stdout: Readable;
      stderr: Readable;
      kill: (signal?: NodeJS.Signals) => boolean;
      pid?: number;
    };
    child.stdout = new Readable({ read() {} });
    child.stderr = new Readable({ read() {} });
    child.pid = 4242;
    let killSignal: NodeJS.Signals | undefined;
    child.kill = (signal?: NodeJS.Signals) => {
      killSignal = signal ?? "SIGTERM";
      // Simulate child exit on SIGTERM almost immediately so the bounds path
      // converges in the test.
      setImmediate(() => child.emit("exit", null, killSignal ?? "SIGTERM"));
      return true;
    };
    recorded.push({ binary, argv: [...argv], options, child });

    setImmediate(() => {
      if (spec.emitErrno) {
        const e: NodeJS.ErrnoException = new Error("spawn error") as NodeJS.ErrnoException;
        e.code = spec.emitErrno;
        child.emit("error", e);
        return;
      }
      if (spec.chunkedStdout) {
        for (const chunk of spec.chunkedStdout) {
          child.stdout.push(chunk);
        }
      } else if (spec.stdout) {
        child.stdout.push(Buffer.from(spec.stdout, "utf8"));
      }
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

// Per-call-varying spawn stub: serves specs[callCount++] so attempt 1 and attempt 2 of the
// ADR-029 single retry can differ (e.g. cold-start on call 1, success on call 2). The static
// makeStubSpawn replays one spec for every call and so cannot exercise the retry. Exposes
// calls() for exact spawn-count assertions (the bounded-retry invariant: calls() === 2 on a
// trigger, === 1 otherwise). On overflow it replays the last spec so an accidental third call
// surfaces as a calls() assertion failure rather than crashing the test.
function makeScriptedSpawn(specs: StubChildSpec[]): { spawnFn: SpawnLike; calls: () => number } {
  let callCount = 0;
  const spawnFn: SpawnLike = (binary, argv, options) => {
    const spec = specs[callCount] ?? specs[specs.length - 1]!;
    callCount += 1;
    if (spec.errorOnSpawn) {
      throw spec.errorOnSpawn;
    }
    const child = new EventEmitter() as EventEmitter & {
      stdout: Readable;
      stderr: Readable;
      kill: (signal?: NodeJS.Signals) => boolean;
      pid?: number;
    };
    child.stdout = new Readable({ read() {} });
    child.stderr = new Readable({ read() {} });
    child.pid = 4242;
    let killSignal: NodeJS.Signals | undefined;
    child.kill = (signal?: NodeJS.Signals) => {
      killSignal = signal ?? "SIGTERM";
      setImmediate(() => child.emit("exit", null, killSignal ?? "SIGTERM"));
      return true;
    };
    void [binary, argv, options];

    setImmediate(() => {
      if (spec.emitError) {
        child.emit("error", spec.emitError);
        return;
      }
      if (spec.emitErrno) {
        const e: NodeJS.ErrnoException = new Error("spawn error") as NodeJS.ErrnoException;
        e.code = spec.emitErrno;
        child.emit("error", e);
        return;
      }
      if (spec.chunkedStdout) {
        for (const chunk of spec.chunkedStdout) {
          child.stdout.push(chunk);
        }
      } else if (spec.stdout) {
        child.stdout.push(Buffer.from(spec.stdout, "utf8"));
      }
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
  return { spawnFn, calls: () => callCount };
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

async function captureRejection(p: Promise<unknown>): Promise<UpstreamError> {
  try {
    await p;
    throw new Error("expected rejection but promise resolved");
  } catch (e) {
    if (!(e instanceof UpstreamError)) throw new Error(`expected UpstreamError, got ${String(e)}`);
    return e;
  }
}

// Attach a rejection handler SYNCHRONOUSLY at promise-creation time, so a
// rejection emitted inside `vi.advanceTimersByTimeAsync(...)` is observed
// immediately and never surfaces as a Node "unhandledRejection" event.
function pendingRejection<T>(p: Promise<T>): Promise<UpstreamError> {
  return p.then(
    () => { throw new Error("expected rejection but promise resolved"); },
    (e: unknown) => {
      if (!(e instanceof UpstreamError)) throw new Error(`expected UpstreamError, got ${String(e)}`);
      return e;
    },
  );
}

// Synchronously-resolving resolver stub — bypasses real fs.access I/O so timing-
// sensitive tests (fake timers, microtask kills) don't race with the production
// resolver's libuv access call on Linux/macOS hosts.
const stubResolveBinary = async () => ({
  path: "obsidian",
  attempts: [{ source: "PATH" as const, path: "obsidian", outcome: "pending" as const }],
});

const baseInput = (over: Partial<DispatchInput> = {}): DispatchInput => ({
  command: "read",
  parameters: {},
  flags: [],
  timeoutMs: 10_000,
  outputCapBytes: 10 * 1024 * 1024,
  ...over,
});

beforeEach(() => {
  __resetInFlightRegistryForTests();
});

afterEach(() => {
  __resetInFlightRegistryForTests();
});

describe("assembleArgv (FR-012 — documented obsidian_exec.md:27 order)", () => {
  it("[binary, vault=..., command, kvs..., flags..., --copy]", () => {
    const argv = assembleArgv(
      {
        command: "read",
        vault: "MyVault",
        parameters: { file: "Note", lines: 5 },
        flags: ["silent"],
        copy: true,
        timeoutMs: 10_000,
        outputCapBytes: 10 * 1024 * 1024,
      },
      "obsidian",
    );
    expect(argv).toEqual(["obsidian", "vault=MyVault", "read", "file=Note", "lines=5", "silent", "--copy"]);
  });

  it("vault omitted produces no vault= prefix", () => {
    const argv = assembleArgv(baseInput({ command: "version" }), "obsidian");
    expect(argv).toEqual(["obsidian", "version"]);
  });

  it("undefined parameter values are dropped", () => {
    const argv = assembleArgv(baseInput({ command: "x", parameters: { a: "1", b: undefined, c: 2 } }), "obsidian");
    expect(argv).toEqual(["obsidian", "x", "a=1", "c=2"]);
  });

  it("copy: false omits --copy", () => {
    const argv = assembleArgv(baseInput({ command: "x", copy: false }), "obsidian");
    expect(argv).toEqual(["obsidian", "x"]);
  });
});

describe("dispatchCli — four-priority classification (FR-014)", () => {
  it("ENOENT on spawn → CLI_BINARY_NOT_FOUND with details {platform, attempts, PATH}", async () => {
    const cap = captureLines();
    const enoent: NodeJS.ErrnoException = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    const { spawnFn } = makeStubSpawn({ errorOnSpawn: enoent });
    const err = (await captureRejection(
      dispatchCli(baseInput({ command: "v" }), { spawnFn, env: { PATH: "/x" }, logger: cap.logger }),
    )) as UpstreamError;
    expect(err.code).toBe("CLI_BINARY_NOT_FOUND");
    expect(err.details).toMatchObject({
      platform: expect.any(String),
      attempts: expect.any(Array),
      PATH: "/x",
    });
    const attempts = err.details.attempts as Array<{ source: string; path: string; outcome: string }>;
    expect(attempts.at(-1)).toEqual({ source: "PATH", path: "obsidian", outcome: "not-found" });
    expect(cap.lines()).toEqual([]); // No log emission.
  });

  it("child.error ENOENT → CLI_BINARY_NOT_FOUND with details {platform, attempts, PATH}", async () => {
    const cap = captureLines();
    const { spawnFn } = makeStubSpawn({ emitErrno: "ENOENT" });
    const err = (await captureRejection(
      dispatchCli(baseInput({ command: "v" }), { spawnFn, env: { PATH: "/x" }, logger: cap.logger }),
    )) as UpstreamError;
    expect(err.code).toBe("CLI_BINARY_NOT_FOUND");
    expect(err.details).toMatchObject({
      platform: expect.any(String),
      attempts: expect.any(Array),
      PATH: "/x",
    });
    const attempts = err.details.attempts as Array<{ source: string; path: string; outcome: string }>;
    expect(attempts.at(-1)).toEqual({ source: "PATH", path: "obsidian", outcome: "not-found" });
  });

  // child.on("error") non-ENOENT fallthrough (_dispatch.ts L213): a runtime spawn error
  // whose code is NOT "ENOENT" rejects with the RAW Error verbatim — NOT an UpstreamError.
  // captureRejection / pendingRejection assert instanceof UpstreamError, so catch raw here.
  it("child.error EACCES (non-ENOENT) → rejects with the RAW Error, not UpstreamError", async () => {
    const cap = captureLines();
    const { spawnFn } = makeStubSpawn({ emitErrno: "EACCES" });
    let caught: unknown;
    try {
      await dispatchCli(baseInput({ command: "v" }), { spawnFn, env: { PATH: "/x" }, logger: cap.logger });
      throw new Error("expected rejection but promise resolved");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(UpstreamError);
    expect((caught as NodeJS.ErrnoException).code).toBe("EACCES");
  });

  // settlePathAttempt identity return (_dispatch.ts L82): when the resolver's last attempt is
  // NOT a pending PATH attempt (here an OBSIDIAN_BIN-resolved binary), settlePathAttempt returns
  // the attempts array unchanged. Trip ENOENT on spawn so the classification reads the un-settled
  // attempts through the L82 branch.
  it("OBSIDIAN_BIN-resolved binary + spawn ENOENT → attempts returned unchanged (no PATH settle)", async () => {
    const cap = captureLines();
    const resolveBinaryFn = async () => ({
      path: "/opt/obsidian",
      attempts: [{ source: "OBSIDIAN_BIN" as const, path: "/opt/obsidian", outcome: "resolved" as const }],
    });
    const enoent: NodeJS.ErrnoException = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    const { spawnFn } = makeStubSpawn({ errorOnSpawn: enoent });
    const err = (await captureRejection(
      dispatchCli(baseInput({ command: "v" }), {
        spawnFn,
        env: { PATH: "/x" },
        logger: cap.logger,
        resolveBinary: resolveBinaryFn,
      }),
    )) as UpstreamError;
    expect(err.code).toBe("CLI_BINARY_NOT_FOUND");
    const attempts = err.details.attempts as Array<{ source: string; path: string; outcome: string }>;
    // Identity return: no trailing pending PATH attempt to settle, so unchanged.
    expect(attempts).toEqual([{ source: "OBSIDIAN_BIN", path: "/opt/obsidian", outcome: "resolved" }]);
  });

  it("OBSIDIAN_BIN set and not executable → resolveBinary throws → CLI_BINARY_NOT_FOUND propagates", async () => {
    const cap = captureLines();
    // Use a real non-existent path so the production fsPromises.access fires ENOENT —
    // ESM module namespace prevents vi.spyOn against fs/promises.
    const missingPath = `/__obsidian_cli_mcp_definitely_missing_${Date.now()}__/obsidian`;
    const { spawnFn, recorded } = makeStubSpawn({});
    const err = (await captureRejection(
      dispatchCli(baseInput({ command: "v" }), {
        spawnFn,
        env: { OBSIDIAN_BIN: missingPath, PATH: "/x" },
        logger: cap.logger,
      }),
    )) as UpstreamError;
    expect(err.code).toBe("CLI_BINARY_NOT_FOUND");
    expect(err.details).toMatchObject({
      platform: expect.any(String),
      PATH: "/x",
    });
    const attempts = err.details.attempts as Array<{ source: string; path: string; outcome: string }>;
    expect(attempts).toEqual([{ source: "OBSIDIAN_BIN", path: missingPath, outcome: "not-found" }]);
    expect(recorded.length).toBe(0); // spawn never fired — resolver threw first.
  });

  it("resolver returns successfully → spawn proceeds with the resolved binary", async () => {
    const cap = captureLines();
    const { spawnFn, recorded } = makeStubSpawn({ stdout: "ok\n", exitCode: 0 });
    // OBSIDIAN_BIN unset; on Windows host the resolver skips platform-default and
    // returns the bare command name "obsidian", which the dispatch stub spawn receives.
    const result = await dispatchCli(baseInput({ command: "version" }), {
      spawnFn,
      env: { PATH: "/x" },
      logger: cap.logger,
    });
    expect(result.exitCode).toBe(0);
    expect(result.argv[0]).toBe(recorded[0]?.binary);
  });

  it("non-zero exit → CLI_NON_ZERO_EXIT with NO log emission", async () => {
    const cap = captureLines();
    const { spawnFn } = makeStubSpawn({ stderr: "boom", exitCode: 1 });
    const err = await captureRejection(
      dispatchCli(baseInput({ command: "x" }), { spawnFn, env: {}, logger: cap.logger }),
    );
    expect(err.code).toBe("CLI_NON_ZERO_EXIT");
    expect(err.cause).toEqual({ exitCode: 1, signal: null });
    expect(err.details).toMatchObject({ exitCode: 1, stderr: "boom" });
    expect(cap.lines()).toEqual([]);
  });

  it("ERR_NO_ACTIVE_FILE — exit 0 with literal prefix → recovery message verbatim, NO log", async () => {
    const cap = captureLines();
    const { spawnFn } = makeStubSpawn({ stdout: "Error: no active file\n", exitCode: 0 });
    const err = await captureRejection(
      dispatchCli(baseInput({ command: "read" }), { spawnFn, env: {}, logger: cap.logger }),
    );
    expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
    expect(err.message).toBe(
      'No active file in Obsidian. Open a note in the editor, or call this tool with target_mode: "specific" and an explicit vault/file.',
    );
    expect(err.details).toMatchObject({ message: "Error: no active file", exitCode: 0 });
    expect(cap.lines()).toEqual([]);
  });

  it("CLI_REPORTED_ERROR — exit 0 with 'Error:' (other suffix), priority (c)", async () => {
    const cap = captureLines();
    const { spawnFn } = makeStubSpawn({ stdout: "Error: File not found\n", exitCode: 0 });
    const err = await captureRejection(
      dispatchCli(baseInput({ command: "read" }), { spawnFn, env: {}, logger: cap.logger }),
    );
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details.message).toBe("Error: File not found");
    expect(cap.lines()).toEqual([]);
  });

  it("priority (a) beats (b): exit 1 + 'Error: no active file' stdout → CLI_NON_ZERO_EXIT", async () => {
    const cap = captureLines();
    const { spawnFn } = makeStubSpawn({ stdout: "Error: no active file\n", exitCode: 1 });
    const err = await captureRejection(
      dispatchCli(baseInput({ command: "read" }), { spawnFn, env: {}, logger: cap.logger }),
    );
    expect(err.code).toBe("CLI_NON_ZERO_EXIT");
  });

  it("priority (b) beats (c): 'Error: no active file. <suffix>' still classifies as ERR_NO_ACTIVE_FILE", async () => {
    const cap = captureLines();
    const { spawnFn } = makeStubSpawn({
      stdout: "Error: no active file. Open one or use specific mode.\n",
      exitCode: 0,
    });
    const err = await captureRejection(
      dispatchCli(baseInput({ command: "read" }), { spawnFn, env: {}, logger: cap.logger }),
    );
    expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
  });

  // BI-041 FR-001 / US1 — canonical capital-N upstream emit classifies.
  it("capital-N: 'Error: No active file\\n' classifies as ERR_NO_ACTIVE_FILE", async () => {
    const cap = captureLines();
    const { spawnFn } = makeStubSpawn({ stdout: "Error: No active file\n", exitCode: 0 });
    const err = await captureRejection(
      dispatchCli(baseInput({ command: "delete" }), { spawnFn, env: {}, logger: cap.logger }),
    );
    expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
    expect(err.message).toBe(
      'No active file in Obsidian. Open a note in the editor, or call this tool with target_mode: "specific" and an explicit vault/file.',
    );
  });

  // BI-041 FR-001 — period-terminator + capital-N (the verbatim T0-captured upstream phrase).
  it("period-terminator: 'Error: No active file.\\n' classifies as ERR_NO_ACTIVE_FILE", async () => {
    const cap = captureLines();
    const { spawnFn } = makeStubSpawn({ stdout: "Error: No active file.\n", exitCode: 0 });
    const err = await captureRejection(
      dispatchCli(baseInput({ command: "rename" }), { spawnFn, env: {}, logger: cap.logger }),
    );
    expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
  });

  // BI-041 FR-001 / Edge Cases "case spectrum" — mixed-case variants classify.
  it("mixed-case all-upper: 'ERROR: NO ACTIVE FILE!\\n' classifies as ERR_NO_ACTIVE_FILE", async () => {
    const cap = captureLines();
    const { spawnFn } = makeStubSpawn({ stdout: "ERROR: NO ACTIVE FILE!\n", exitCode: 0 });
    const err = await captureRejection(
      dispatchCli(baseInput({ command: "outline" }), { spawnFn, env: {}, logger: cap.logger }),
    );
    expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
  });

  it("mixed-case partial: 'Error: NO active file: foo\\n' classifies as ERR_NO_ACTIVE_FILE", async () => {
    const cap = captureLines();
    const { spawnFn } = makeStubSpawn({ stdout: "Error: NO active file: foo\n", exitCode: 0 });
    const err = await captureRejection(
      dispatchCli(baseInput({ command: "read" }), { spawnFn, env: {}, logger: cap.logger }),
    );
    expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
  });

  // BI-041 FR-001 anchor-at-head invariant — substring-of-longer-unrelated-message MUST NOT classify.
  // The case-insensitive match remains anchored to the message head (prefix), not substring-anywhere.
  it("substring-of-unrelated-message: 'Error: file open failed: no active file in vault\\n' does NOT classify as ERR_NO_ACTIVE_FILE", async () => {
    const cap = captureLines();
    const { spawnFn } = makeStubSpawn({
      stdout: "Error: file open failed: no active file in vault\n",
      exitCode: 0,
    });
    const err = await captureRejection(
      dispatchCli(baseInput({ command: "read" }), { spawnFn, env: {}, logger: cap.logger }),
    );
    expect(err.code).toBe("CLI_REPORTED_ERROR");
  });

  it("signal-only termination: exitCode=-1 sentinel + signal carried in details", async () => {
    const cap = captureLines();
    const { spawnFn } = makeStubSpawn({ exitCode: null, signal: "SIGTERM" });
    const err = await captureRejection(
      dispatchCli(baseInput({ command: "read" }), { spawnFn, env: {}, logger: cap.logger }),
    );
    expect(err.code).toBe("CLI_NON_ZERO_EXIT");
    expect(err.cause).toEqual({ exitCode: -1, signal: "SIGTERM" });
  });

  it("success path resolves with {stdout, stderr, exitCode: 0, argv} and emits ZERO log lines (SC-011)", async () => {
    const cap = captureLines();
    const { spawnFn } = makeStubSpawn({ stdout: "ok\n", exitCode: 0 });
    const out = await dispatchCli(
      baseInput({ command: "version", vault: "V", parameters: { x: 1 } }),
      { spawnFn, env: {}, logger: cap.logger },
    );
    expect(out.stdout).toBe("ok\n");
    expect(out.exitCode).toBe(0);
    expect(out.argv).toEqual(["obsidian", "vault=V", "version", "x=1"]);
    expect(cap.lines()).toEqual([]);
  });
});

describe("dispatchCli — bounds enforcement (FR-009 / FR-010)", () => {
  it("CLI_TIMEOUT — emits exactly ONE dispatch.timeout line (SC-011)", async () => {
    vi.useFakeTimers();
    try {
      const cap = captureLines();
      const { spawnFn } = makeStubSpawn({ hold: true });
      const rejected = pendingRejection(
        dispatchCli(
          baseInput({ command: "read", timeoutMs: 1_000 }),
          { spawnFn, env: {}, logger: cap.logger, resolveBinary: stubResolveBinary },
        ),
      );
      // Let microtasks resolve so spawn happens and listeners attach.
      await vi.advanceTimersByTimeAsync(0);
      // Trip the timeout — child.kill(SIGTERM) inside the stub schedules an exit on setImmediate.
      await vi.advanceTimersByTimeAsync(1_001);
      const err = await rejected;
      expect(err.code).toBe("CLI_TIMEOUT");
      expect(err.details).toMatchObject({ timeoutMs: 1_000 });
      const lines = cap.lines();
      expect(lines.length).toBe(1);
      const parsed = JSON.parse(lines[0]!);
      expect(parsed.event).toBe("dispatch.timeout");
      expect(parsed.timeoutMs).toBe(1_000);
      expect(parsed.command).toBe("read");
    } finally {
      vi.useRealTimers();
    }
  });

  it("CLI_OUTPUT_TOO_LARGE — partial truncated to outputCapBytes; emits exactly ONE dispatch.cap line", async () => {
    const cap = captureLines();
    const big = Buffer.alloc(2_000, 65); // 2_000 'A' bytes
    const small = Buffer.alloc(2_000, 65);
    const { spawnFn } = makeStubSpawn({
      chunkedStdout: [big, small],
      // no exitCode — child.kill on cap-fired will emit exit
      hold: true,
    });
    const err = await captureRejection(
      dispatchCli(
        baseInput({ command: "x", outputCapBytes: 3_000, timeoutMs: 60_000 }),
        { spawnFn, env: {}, logger: cap.logger },
      ),
    );
    expect(err.code).toBe("CLI_OUTPUT_TOO_LARGE");
    expect(err.details).toMatchObject({
      stream: "stdout",
      limitBytes: 3_000,
      capturedBytes: 4_000,
    });
    expect((err.details.partial as string).length).toBe(3_000);
    const lines = cap.lines();
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.event).toBe("dispatch.cap");
    expect(parsed.stream).toBe("stdout");
    expect(parsed.limitBytes).toBe(3_000);
  });

  // stderr output-cap mirror (_dispatch.ts L185-188): a single OVERSIZED spec.stderr string +
  // a small outputCapBytes trips killChild({kind:"cap",stream:"stderr"}), settling as
  // CLI_OUTPUT_TOO_LARGE with stream "stderr" and partial truncated to the cap.
  it("CLI_OUTPUT_TOO_LARGE on stderr — partial truncated to outputCapBytes; emits ONE dispatch.cap line", async () => {
    const cap = captureLines();
    // 4_000 'B' bytes on stderr, cap 3_000. Single chunk via spec.stderr trips the cap.
    const { spawnFn } = makeStubSpawn({
      stderr: "B".repeat(4_000),
      hold: true,
    });
    const err = await captureRejection(
      dispatchCli(
        baseInput({ command: "x", outputCapBytes: 3_000, timeoutMs: 60_000 }),
        { spawnFn, env: {}, logger: cap.logger },
      ),
    );
    expect(err.code).toBe("CLI_OUTPUT_TOO_LARGE");
    expect(err.details).toMatchObject({
      stream: "stderr",
      limitBytes: 3_000,
      capturedBytes: 4_000,
    });
    expect((err.details.partial as string).length).toBe(3_000);
    const lines = cap.lines();
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.event).toBe("dispatch.cap");
    expect(parsed.stream).toBe("stderr");
    expect(parsed.limitBytes).toBe(3_000);
  });
});

describe("dispatchCli — atomic in-flight registry (FR-015a / Q5)", () => {
  it("inFlightChild is set synchronously after spawn returns (no microtask gap)", async () => {
    const cap = captureLines();
    let observedKilled = false;
    const spawnFn: SpawnLike = (binary, argv, options) => {
      // Simulate the spec-mandated race: a SIGINT-equivalent handler races
      // the spawn-to-insert window. Schedule killInFlightChildren() on the
      // next microtask. If insertion were async, this would observe a null
      // registry. Because insertion is synchronous, it observes the child.
      queueMicrotask(() => {
        observedKilled = killInFlightChildren();
      });
      // Reuse the stub spawn — emit exit after a tick.
      const child = new EventEmitter() as EventEmitter & {
        stdout: Readable;
        stderr: Readable;
        kill: (signal?: NodeJS.Signals) => boolean;
        pid?: number;
      };
      child.stdout = new Readable({ read() {} });
      child.stderr = new Readable({ read() {} });
      child.pid = 9999;
      child.kill = (signal?: NodeJS.Signals) => {
        setImmediate(() => child.emit("exit", null, signal ?? "SIGTERM"));
        return true;
      };
      void [binary, argv, options];
      return child as unknown as ReturnType<SpawnLike>;
    };
    await captureRejection(
      dispatchCli(baseInput({ command: "x" }), { spawnFn, env: {}, logger: cap.logger }),
    );
    expect(observedKilled).toBe(true);
  });
});

describe("dispatchCli — failure-only logging discipline (SC-011 / FR-018a)", () => {
  it.each([
    [{ stdout: "ok", exitCode: 0 } as StubChildSpec, "success"],
    [{ stdout: "Error: no active file\n", exitCode: 0 }, "ERR_NO_ACTIVE_FILE"],
    [{ stdout: "Error: file not found\n", exitCode: 0 }, "CLI_REPORTED_ERROR"],
    [{ stderr: "boom", exitCode: 1 }, "CLI_NON_ZERO_EXIT"],
    [{ emitErrno: "ENOENT" as const }, "CLI_BINARY_NOT_FOUND"],
  ])("emits ZERO stderr lines for verdict that did not fire bounds (%s)", async (stub, _name) => {
    const cap = captureLines();
    const { spawnFn } = makeStubSpawn(stub);
    try {
      await dispatchCli(baseInput({ command: "x" }), { spawnFn, env: {}, logger: cap.logger });
    } catch {
      /* expected for failure cases */
    }
    expect(cap.lines()).toEqual([]);
  });
});

describe("killInFlightChildren — public surface (FR-016)", () => {
  it("returns false when no child is in flight", () => {
    expect(killInFlightChildren()).toBe(false);
  });

  it("mid-flight: returns true, SIGTERMs the child, emits one dispatch.kill line", async () => {
    const cap = captureLines();
    const { spawnFn } = makeStubSpawn({ hold: true });
    const promise = dispatchCli(
      baseInput({ command: "read", timeoutMs: 60_000 }),
      { spawnFn, env: {}, logger: cap.logger, resolveBinary: stubResolveBinary },
    );
    // Wait one microtask to ensure the spawn has executed and the registry is populated.
    await Promise.resolve();
    await Promise.resolve();
    const killed = killInFlightChildren();
    expect(killed).toBe(true);
    await captureRejection(promise);
    const lines = cap.lines();
    const killLines = lines.filter((l) => JSON.parse(l).event === "dispatch.kill");
    expect(killLines.length).toBe(1);
    const parsed = JSON.parse(killLines[0]!);
    expect(parsed.command).toBe("read");
    expect(parsed.pid).toBe(4242);
  });

  it("SIGKILL grace timer is set to SIGKILL_GRACE_MS (2 s)", () => {
    expect(SIGKILL_GRACE_MS).toBe(2_000);
  });
});

// ADR-029 single cold-start retry. COLD_START_STDOUT is built from the production
// COLD_START_INVARIANT (imported, single source of truth) so the test fixture and the
// matcher can never drift. It mirrors the T0-pinned literal:
//   Error: Command "<cmd>" not found. It may require a plugin to be enabled.
// which dispatchCli priority (c) classifies as CLI_REPORTED_ERROR (stdout starts "Error:").
const COLD_START_STDOUT = `Error: Command "read" ${COLD_START_INVARIANT}\n`;

describe("dispatchCli — ADR-029 cold-start single retry", () => {
  // US1 (T013) — the MVP: a form-(a) cold-start on attempt 1 is absorbed by one retry.
  it("US1: form-(a) cold-start on attempt 1 → success on attempt 2; resolves call-2 output; calls()===2", async () => {
    const cap = captureLines();
    const { spawnFn, calls } = makeScriptedSpawn([
      { stdout: COLD_START_STDOUT, exitCode: 0 },
      { stdout: "ok\n", exitCode: 0 },
    ]);
    const out = await dispatchCli(baseInput({ command: "read" }), {
      spawnFn,
      env: {},
      logger: cap.logger,
      resolveBinary: stubResolveBinary,
    });
    expect(out.stdout).toBe("ok\n");
    expect(out.exitCode).toBe(0);
    expect(calls()).toBe(2);
  });

  // US2 (T017) — Q1 second-attempt-authoritative: cold-start → a DIFFERENT real error.
  // The attempt-2 CLI_NON_ZERO_EXIT surfaces; attempt-1's CLI_REPORTED_ERROR is discarded
  // (proven by the details parity: stderr "boom"/exitCode 1, not the cold-start stdout).
  it("US2: cold-start → different real error → attempt-2 CLI_NON_ZERO_EXIT is authoritative; calls()===2", async () => {
    const cap = captureLines();
    const { spawnFn, calls } = makeScriptedSpawn([
      { stdout: COLD_START_STDOUT, exitCode: 0 },
      { stderr: "boom", exitCode: 1 },
    ]);
    const err = await captureRejection(
      dispatchCli(baseInput({ command: "read" }), {
        spawnFn,
        env: {},
        logger: cap.logger,
        resolveBinary: stubResolveBinary,
      }),
    );
    expect(err.code).toBe("CLI_NON_ZERO_EXIT");
    expect(err.cause).toEqual({ exitCode: 1, signal: null });
    expect(err.details).toMatchObject({ stderr: "boom", exitCode: 1 });
    expect(err.details.stdout).not.toContain(COLD_START_INVARIANT); // attempt-1 discarded
    expect(calls()).toBe(2);
  });

  // US2 (T018) — bounded, not a loop: cold-start twice propagates the attempt-2
  // CLI_REPORTED_ERROR after EXACTLY one retry.
  it("US2: cold-start → cold-start → propagates CLI_REPORTED_ERROR after one retry; calls()===2 exactly", async () => {
    const cap = captureLines();
    const { spawnFn, calls } = makeScriptedSpawn([
      { stdout: COLD_START_STDOUT, exitCode: 0 },
      { stdout: COLD_START_STDOUT, exitCode: 0 },
    ]);
    const err = await captureRejection(
      dispatchCli(baseInput({ command: "read" }), {
        spawnFn,
        env: {},
        logger: cap.logger,
        resolveBinary: stubResolveBinary,
      }),
    );
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details.stdout).toContain(COLD_START_INVARIANT);
    expect(calls()).toBe(2);
  });

  // US2 (T019) — non-cold-start first failures are NEVER retried (single-shot).
  it("US2: non-cold-start CLI_NON_ZERO_EXIT first failure → NO retry; calls()===1", async () => {
    const cap = captureLines();
    const { spawnFn, calls } = makeScriptedSpawn([{ stderr: "boom", exitCode: 1 }]);
    const err = await captureRejection(
      dispatchCli(baseInput({ command: "x" }), {
        spawnFn,
        env: {},
        logger: cap.logger,
        resolveBinary: stubResolveBinary,
      }),
    );
    expect(err.code).toBe("CLI_NON_ZERO_EXIT");
    expect(calls()).toBe(1);
  });

  it("US2: ERR_NO_ACTIVE_FILE first failure → NO retry; calls()===1", async () => {
    const cap = captureLines();
    const { spawnFn, calls } = makeScriptedSpawn([{ stdout: "Error: No active file.\n", exitCode: 0 }]);
    const err = await captureRejection(
      dispatchCli(baseInput({ command: "delete" }), {
        spawnFn,
        env: {},
        logger: cap.logger,
        resolveBinary: stubResolveBinary,
      }),
    );
    expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
    expect(calls()).toBe(1);
  });

  it("US2: a non-invariant exit-0 'Error:' (CLI_REPORTED_ERROR but not cold-start) → NO retry; calls()===1", async () => {
    const cap = captureLines();
    const { spawnFn, calls } = makeScriptedSpawn([{ stdout: "Error: File not found\n", exitCode: 0 }]);
    const err = await captureRejection(
      dispatchCli(baseInput({ command: "read" }), {
        spawnFn,
        env: {},
        logger: cap.logger,
        resolveBinary: stubResolveBinary,
      }),
    );
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details.message).toBe("Error: File not found");
    expect(calls()).toBe(1); // not the cold-start invariant → single-shot
  });

  it("US2: CLI_TIMEOUT first failure → NO retry; calls()===1", async () => {
    vi.useFakeTimers();
    try {
      const cap = captureLines();
      const { spawnFn, calls } = makeScriptedSpawn([{ hold: true }]);
      const rejected = pendingRejection(
        dispatchCli(baseInput({ command: "read", timeoutMs: 1_000 }), {
          spawnFn,
          env: {},
          logger: cap.logger,
          resolveBinary: stubResolveBinary,
        }),
      );
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(1_001);
      const err = await rejected;
      expect(err.code).toBe("CLI_TIMEOUT");
      expect(calls()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  // US2 (T020) — zero-new-codes: the retry mints no top-level UpstreamError.code outside
  // the known union; the persistent cold-start propagates an existing code.
  it("US2: zero-new-codes — propagated code stays within the known UpstreamError union", async () => {
    const known = new Set([
      "CLI_BINARY_NOT_FOUND",
      "CLI_TIMEOUT",
      "CLI_OUTPUT_TOO_LARGE",
      "CLI_NON_ZERO_EXIT",
      "ERR_NO_ACTIVE_FILE",
      "CLI_REPORTED_ERROR",
    ]);
    const cap = captureLines();
    const { spawnFn } = makeScriptedSpawn([
      { stdout: COLD_START_STDOUT, exitCode: 0 },
      { stdout: COLD_START_STDOUT, exitCode: 0 },
    ]);
    const err = await captureRejection(
      dispatchCli(baseInput({ command: "read" }), {
        spawnFn,
        env: {},
        logger: cap.logger,
        resolveBinary: stubResolveBinary,
      }),
    );
    expect(known.has(err.code)).toBe(true);
  });

  // US3 (T024) — bounded/terminate: calls() never exceeds 2; "vault never available"
  // (cold-start on both attempts) terminates by propagating after one retry (no hang/loop).
  it("US3: bounded — vault-never-available terminates after exactly one retry; calls()===2 (<=2)", async () => {
    const cap = captureLines();
    const { spawnFn, calls } = makeScriptedSpawn([
      { stdout: COLD_START_STDOUT, exitCode: 0 },
      { stdout: COLD_START_STDOUT, exitCode: 0 },
      { stdout: "ok\n", exitCode: 0 }, // a 3rd spec exists; a correct bounded retry never reaches it
    ]);
    await captureRejection(
      dispatchCli(baseInput({ command: "read" }), {
        spawnFn,
        env: {},
        logger: cap.logger,
        resolveBinary: stubResolveBinary,
      }),
    );
    expect(calls()).toBeLessThanOrEqual(2);
    expect(calls()).toBe(2);
  });

  // US3 (T025) — observability: a retry emits one dispatch.retry line carrying both callIds.
  it("US3: observability — retry emits a dispatch.retry line with both attempt callIds", async () => {
    const cap = captureLines();
    const { spawnFn } = makeScriptedSpawn([
      { stdout: COLD_START_STDOUT, exitCode: 0 },
      { stdout: "ok\n", exitCode: 0 },
    ]);
    await dispatchCli(baseInput({ command: "read" }), {
      spawnFn,
      env: {},
      logger: cap.logger,
      resolveBinary: stubResolveBinary,
    });
    const retryLines = cap.lines().filter((l) => JSON.parse(l).event === "dispatch.retry");
    expect(retryLines.length).toBe(1);
    const parsed = JSON.parse(retryLines[0]!);
    expect(parsed.command).toBe("read");
    expect(typeof parsed.firstCallId).toBe("string");
    expect(typeof parsed.secondCallId).toBe("string");
    expect(parsed.firstCallId.length).toBeGreaterThan(0);
    expect(parsed.secondCallId.length).toBeGreaterThan(0);
    expect(parsed.firstCallId).not.toBe(parsed.secondCallId); // fresh id per attempt (D7)
  });

  it("US3: no dispatch.retry line on a non-retried (single-shot) failure", async () => {
    const cap = captureLines();
    const { spawnFn } = makeScriptedSpawn([{ stderr: "boom", exitCode: 1 }]);
    await captureRejection(
      dispatchCli(baseInput({ command: "x" }), {
        spawnFn,
        env: {},
        logger: cap.logger,
        resolveBinary: stubResolveBinary,
      }),
    );
    expect(cap.lines().filter((l) => JSON.parse(l).event === "dispatch.retry")).toEqual([]);
  });

  // US3 (T026) — shutdown race (research D6): if shutdown begins before the retry decision,
  // the retry is skipped, attempt-1's error propagates, and NO second spawn happens. The
  // module-level shuttingDown flag is set by killInFlightChildren() — the production shutdown
  // entry point invoked from server.ts triggerShutdown — so this exercises the real path.
  it("US3: shutdown before the retry → retry skipped, attempt-1 error propagates, calls()===1", async () => {
    const cap = captureLines();
    const { spawnFn, calls } = makeScriptedSpawn([
      { stdout: COLD_START_STDOUT, exitCode: 0 },
      { stdout: "ok\n", exitCode: 0 }, // would resolve IF the retry (wrongly) fired
    ]);
    killInFlightChildren(); // registry empty → returns false, but sets shuttingDown = true
    const err = await captureRejection(
      dispatchCli(baseInput({ command: "read" }), {
        spawnFn,
        env: {},
        logger: cap.logger,
        resolveBinary: stubResolveBinary,
      }),
    );
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.details.stdout).toContain(COLD_START_INVARIANT);
    expect(calls()).toBe(1);
    expect(cap.lines().filter((l) => JSON.parse(l).event === "dispatch.retry")).toEqual([]);
  });
});
