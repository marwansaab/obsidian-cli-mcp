// Original — no upstream. Co-located vitest cases for the cli-adapter module (FR-016 a–j).
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { invokeCli, UpstreamError, type SpawnLike } from "./cli-adapter.js";

interface StubChildSpec {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  errorOnSpawn?: NodeJS.ErrnoException;
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
    };
    child.stdout = new Readable({ read() {} });
    child.stderr = new Readable({ read() {} });
    child.kill = () => true;
    setImmediate(() => {
      if (spec.stdout) child.stdout.push(Buffer.from(spec.stdout, "utf8"));
      child.stdout.push(null);
      if (spec.stderr) child.stderr.push(Buffer.from(spec.stderr, "utf8"));
      child.stderr.push(null);
      // Defer `close` one more tick so stream `end` events have flushed.
      setImmediate(() => {
        // Use `in` check so `exitCode: null` (signal-only termination case) is preserved
        // — `??` would coalesce null to the default 0, masking the signal-termination signal.
        const closeCode = "exitCode" in spec ? (spec.exitCode ?? null) : 0;
        const closeSignal = "signal" in spec ? (spec.signal ?? null) : null;
        child.emit("close", closeCode, closeSignal);
      });
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

describe("invokeCli", () => {
  // FR-016(a) / Story 1 AC #1: happy specific-mode invocation.
  it("US1 happy specific mode: argv [command, vault=, file=] and resolves stdout/stderr", async () => {
    const { spawnFn, recorded } = makeStubSpawn({
      stdout: "# Note body\n",
      exitCode: 0,
    });
    const result = await invokeCli(
      { command: "read", parameters: { vault: "MyVault", file: "Note" }, flags: [], target_mode: "specific" },
      { spawnFn, env: {} },
    );
    expect(result).toEqual({ stdout: "# Note body\n", stderr: "" });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]!.binary).toBe("obsidian");
    expect(recorded[0]!.argv).toEqual(["read", "vault=MyVault", "file=Note"]);
    expect(recorded[0]!.options.shell).toBe(false);
  });

  // FR-016(g) / Story 1 AC #3: parameters with `undefined` values produce zero argv tokens.
  it("US1 boundary undefined values: argv skips entries whose value is undefined", async () => {
    const { spawnFn, recorded } = makeStubSpawn({ exitCode: 0 });
    await invokeCli(
      {
        command: "read",
        parameters: { vault: "V", file: undefined, query: "q" },
        flags: [],
        target_mode: "specific",
      },
      { spawnFn, env: {} },
    );
    expect(recorded[0]!.argv).toEqual(["read", "vault=V", "query=q"]);
  });

  // FR-016(b) / Story 2 AC #1: active mode strips vault + file, preserves non-target keys.
  it("US2 active-mode strip (vault + file): argv only contains the non-target-locator key", async () => {
    const { spawnFn, recorded } = makeStubSpawn({ exitCode: 0 });
    await invokeCli(
      {
        command: "read",
        parameters: { vault: "V", file: "F", lines: 5 },
        flags: [],
        target_mode: "active",
      },
      { spawnFn, env: {} },
    );
    expect(recorded[0]!.argv).toEqual(["read", "lines=5"]);
  });

  // FR-016(c) / Story 2 AC #2: active mode strips path, preserves non-target keys.
  it("US2 active-mode strip (path): argv preserves the non-target-locator key", async () => {
    const { spawnFn, recorded } = makeStubSpawn({ exitCode: 0 });
    await invokeCli(
      {
        command: "read",
        parameters: { path: "some/path.md", query: "term" },
        flags: [],
        target_mode: "active",
      },
      { spawnFn, env: {} },
    );
    expect(recorded[0]!.argv).toEqual(["read", "query=term"]);
  });

  // FR-016(d) / Story 3 AC #1: non-zero exit → CLI_NON_ZERO_EXIT.
  it("US3 failure CLI_NON_ZERO_EXIT: exit 1 with stderr 'boom' rejects with full details", async () => {
    const { spawnFn } = makeStubSpawn({ stderr: "boom", exitCode: 1 });
    const err = await captureRejection(
      invokeCli(
        { command: "read", parameters: { vault: "V" }, flags: [], target_mode: "specific" },
        { spawnFn, env: {} },
      ),
    );
    expect(err.code).toBe("CLI_NON_ZERO_EXIT");
    expect(err.cause).toEqual({ exitCode: 1, signal: null });
    expect(err.details).toMatchObject({
      command: "read",
      stderr: "boom",
      exitCode: 1,
      signal: null,
    });
  });

  // FR-016(e) / Story 3 AC #2: ERR_NO_ACTIVE_FILE with the verbatim recovery-instruction `.message`.
  it("US3 failure ERR_NO_ACTIVE_FILE: recovery-instruction message verbatim", async () => {
    const { spawnFn } = makeStubSpawn({ stdout: "Error: no active file\n", exitCode: 0 });
    const err = await captureRejection(
      invokeCli(
        { command: "read", parameters: {}, flags: [], target_mode: "active" },
        { spawnFn, env: {} },
      ),
    );
    expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
    expect(err.cause).toBeNull();
    expect(err.details).toEqual({
      command: "read",
      stdout: "Error: no active file\n",
      stderr: "",
      exitCode: 0,
      message: "Error: no active file",
    });
    expect(err.message).toBe(
      'No active file in Obsidian. Open a note in the editor, or call this tool with target_mode: "specific" and an explicit vault/file.',
    );
  });

  // FR-016(f) / Story 3 AC #3: CLI_REPORTED_ERROR for any other `Error:` prefix.
  it("US3 failure CLI_REPORTED_ERROR: stdout starting 'Error: File not found' rejects with details.message trimmed", async () => {
    const { spawnFn } = makeStubSpawn({ stdout: "Error: File not found\n", exitCode: 0 });
    const err = await captureRejection(
      invokeCli(
        { command: "read", parameters: { vault: "V", file: "missing" }, flags: [], target_mode: "specific" },
        { spawnFn, env: {} },
      ),
    );
    expect(err.code).toBe("CLI_REPORTED_ERROR");
    expect(err.cause).toBeNull();
    expect(err.details).toMatchObject({ message: "Error: File not found", exitCode: 0 });
  });

  // FR-016(h): priority (b) beats (c) — the longer 'Error: no active file. <suffix>' line still classifies as ERR_NO_ACTIVE_FILE.
  it("US3 boundary priority (b) beats (c): longer 'Error: no active file. ...' classifies as ERR_NO_ACTIVE_FILE", async () => {
    const { spawnFn } = makeStubSpawn({
      stdout: "Error: no active file. Open one or use specific mode.\n",
      exitCode: 0,
    });
    const err = await captureRejection(
      invokeCli(
        { command: "read", parameters: {}, flags: [], target_mode: "active" },
        { spawnFn, env: {} },
      ),
    );
    expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
    expect(err.code).not.toBe("CLI_REPORTED_ERROR");
    expect(err.details.message).toBe("Error: no active file. Open one or use specific mode.");
  });

  // FR-016(i): priority (a) beats (b) — non-zero exit dominates the stdout-prefix detection.
  it("US3 boundary priority (a) beats (b): exit 1 with 'Error: no active file' stdout classifies as CLI_NON_ZERO_EXIT", async () => {
    const { spawnFn } = makeStubSpawn({ stdout: "Error: no active file\n", exitCode: 1 });
    const err = await captureRejection(
      invokeCli(
        { command: "read", parameters: {}, flags: [], target_mode: "active" },
        { spawnFn, env: {} },
      ),
    );
    expect(err.code).toBe("CLI_NON_ZERO_EXIT");
    expect(err.code).not.toBe("ERR_NO_ACTIVE_FILE");
    expect(err.details).toMatchObject({ exitCode: 1 });
  });

  // FR-016(j) / Q3: signal-only termination — code === null → details.exitCode = -1 sentinel, details.signal = signal name.
  it("US3 boundary signal-only termination: SIGTERM → details.exitCode = -1 sentinel + details.signal carries name", async () => {
    const { spawnFn } = makeStubSpawn({ exitCode: null, signal: "SIGTERM" });
    const err = await captureRejection(
      invokeCli(
        { command: "read", parameters: {}, flags: [], target_mode: "active" },
        { spawnFn, env: {} },
      ),
    );
    expect(err.code).toBe("CLI_NON_ZERO_EXIT");
    expect(err.cause).toEqual({ exitCode: -1, signal: "SIGTERM" });
    expect(err.details).toMatchObject({ exitCode: -1, signal: "SIGTERM" });
  });

  // T020 supplementary: FR-011 / Story 4 AC #1 runtime sentinel — defence-in-depth against
  // a future regression where the re-export is replaced by a local class definition (which
  // would still typecheck but break instanceof chains across module boundaries).
  it("US4 re-export sentinel: UpstreamError is the canonical class identity", () => {
    expect(UpstreamError).toBeDefined();
    expect(UpstreamError.name).toBe("UpstreamError");
  });
});
