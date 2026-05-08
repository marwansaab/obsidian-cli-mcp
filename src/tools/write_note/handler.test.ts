// Original — no upstream. Tests for the write_note handler — argv assembly, response parsing, UpstreamError propagation.
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";

import { afterEach, beforeEach, expect, test } from "vitest";

import { executeWriteNote } from "./handler.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createLogger, type Logger } from "../../logger.js";
import { createQueue } from "../../queue.js";


interface StubChildSpec {
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

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

// (a) Story 1 IT — specific path mode happy path
test("specific+path happy path returns { created: true, path } and emits T0.1 argv shape (Story 1 IT)", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Created: Inbox/Idea.md\n",
    exitCode: 0,
  });
  const result = await executeWriteNote(
    {
      target_mode: "specific",
      vault: "MyVault",
      path: "Inbox/Idea.md",
      content: "# Idea\n\nBody\n",
      overwrite: false,
    },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(result).toEqual({ created: true, path: "Inbox/Idea.md" });
  expect(recorded[0]!.argv).toEqual([
    "vault=MyVault",
    "create",
    "path=Inbox/Idea.md",
    "content=# Idea\n\nBody\n",
  ]);
});

// (b) Story 2 IT — specific file (wikilink → name=) happy path
test("specific+file maps file → name= argv (Story 2 IT, R3 rename)", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Created: ScratchNote-T0-2.md\n",
    exitCode: 0,
  });
  const result = await executeWriteNote(
    {
      target_mode: "specific",
      vault: "MyVault",
      file: "Recipe",
      content: "x",
      overwrite: false,
    },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(result).toEqual({ created: true, path: "ScratchNote-T0-2.md" });
  expect(recorded[0]!.argv).toContain("name=Recipe");
  expect(recorded[0]!.argv).not.toContain("file=Recipe");
});

// (c) Story 4 AC#1 — overwrite=true returns { created: false } and emits overwrite flag
test("specific+overwrite returns { created: false } from 'Overwrote:' wording and emits overwrite flag (Story 4 AC#1, T0.3)", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Overwrote: Existing.md\n",
    exitCode: 0,
  });
  const result = await executeWriteNote(
    {
      target_mode: "specific",
      vault: "MyVault",
      path: "Existing.md",
      content: "rewritten",
      overwrite: true,
    },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(result).toEqual({ created: false, path: "Existing.md" });
  expect(recorded[0]!.argv[recorded[0]!.argv.length - 1]).toBe("overwrite");
});

// (d) Story 3 AC#3 — overwrite-default-false omits flag; T0.5 silent-auto-rename returns success
test("specific+overwrite=false omits 'overwrite' flag; CLI auto-renames per T0.5 — handler propagates success (Story 3 AC#3, T0.5)", async () => {
  // T0.5 finding: CLI silently renames Existing.md -> 'Existing 1.md' when
  // overwrite=false against an existing path. Spec Story 3 originally assumed
  // CLI rejection; reconciliation per research.md "T0 deltas": handler returns
  // success-with-renamed-path. The behavior-preservation criterion (no
  // 'overwrite' flag in argv) IS preserved verbatim.
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Created: Existing 1.md\n",
    exitCode: 0,
  });
  const result = await executeWriteNote(
    {
      target_mode: "specific",
      vault: "MyVault",
      path: "Existing.md",
      content: "should fail",
      overwrite: false,
    },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(result).toEqual({ created: true, path: "Existing 1.md" });
  expect(recorded[0]!.argv).not.toContain("overwrite");
});

// (e) Story 5 IT — active mode happy path; T0.8 fixture (CLI auto-names Untitled.md)
test("active mode emits ['create','content=...','overwrite'] with no locator and parses Untitled.md per T0.8 (Story 5 IT)", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Created: Untitled.md\n",
    exitCode: 0,
  });
  const result = await executeWriteNote(
    { target_mode: "active", content: "rewritten\n", overwrite: true },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(result).toEqual({ created: true, path: "Untitled.md" });
  expect(recorded[0]!.argv).toEqual(["create", "content=rewritten\n", "overwrite"]);
});

// (f) Story 7 AC#1 — CLI_BINARY_NOT_FOUND
test("ENOENT on spawn → CLI_BINARY_NOT_FOUND (Story 7 AC#1)", async () => {
  const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  const { spawnFn } = makeStubSpawn({ errorOnSpawn: enoent });
  const err = (await captureRejection(
    executeWriteNote(
      { target_mode: "specific", vault: "V", path: "P.md", content: "x", overwrite: false },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_BINARY_NOT_FOUND");
});

// (g) Story 7 AC#2 — CLI_NON_ZERO_EXIT
test("non-zero exit + stderr → CLI_NON_ZERO_EXIT (Story 7 AC#2)", async () => {
  const { spawnFn } = makeStubSpawn({ stderr: "permission denied", exitCode: 1 });
  const err = (await captureRejection(
    executeWriteNote(
      { target_mode: "specific", vault: "V", path: "P.md", content: "x", overwrite: false },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_NON_ZERO_EXIT");
  expect(err.details.exitCode).toBe(1);
  expect(err.details.stderr).toBe("permission denied");
});

// (h) Story 7 AC#3 — CLI_REPORTED_ERROR (in-band Error: stdout)
test("exit-0 stdout 'Error: ...' → CLI_REPORTED_ERROR with verbatim message (Story 7 AC#3)", async () => {
  const { spawnFn } = makeStubSpawn({
    stdout: "Error: file already exists at Inbox/Existing.md\n",
    exitCode: 0,
  });
  const err = (await captureRejection(
    executeWriteNote(
      { target_mode: "specific", vault: "V", path: "Inbox/Existing.md", content: "x", overwrite: false },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.message).toBe("Error: file already exists at Inbox/Existing.md");
});

// (i) Story 5 AC#3 — ERR_NO_ACTIVE_FILE in active mode
test("active mode no-active-file → ERR_NO_ACTIVE_FILE with recovery hint (Story 5 AC#3)", async () => {
  const { spawnFn } = makeStubSpawn({ stdout: "Error: no active file\n", exitCode: 0 });
  const err = (await captureRejection(
    executeWriteNote(
      { target_mode: "active", content: "x", overwrite: true },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
  expect(err.message).toContain("No active file");
});

// (j) Story 7 AC#4 — non-UpstreamError re-throw verbatim
test("non-UpstreamError exception is re-thrown verbatim (Story 7 AC#4)", async () => {
  const synthetic = new Error("unexpected runtime error");
  const { spawnFn } = makeStubSpawn({ errorOnSpawn: synthetic });
  const rejection = await captureRejection(
    executeWriteNote(
      { target_mode: "specific", vault: "V", path: "P.md", content: "x", overwrite: false },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  );
  expect(rejection).toBe(synthetic);
  expect(rejection).not.toBeInstanceOf(UpstreamError);
});

// (k) Story 9 AC#1 — empty content
test("empty content emits 'content=' empty token and propagates success (Story 9 AC#1)", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Created: Empty.md\n",
    exitCode: 0,
  });
  const result = await executeWriteNote(
    { target_mode: "specific", vault: "V", path: "Empty.md", content: "", overwrite: false },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(result).toEqual({ created: true, path: "Empty.md" });
  expect(recorded[0]!.argv).toContain("content=");
});

// (l) Story 9 AC#2 — template + content
test("specific mode forwards both content and template tokens (Story 9 AC#2)", async () => {
  const { spawnFn, recorded } = makeStubSpawn({
    stdout: "Created: Daily/2026-05-08.md\n",
    exitCode: 0,
  });
  await executeWriteNote(
    {
      target_mode: "specific",
      vault: "V",
      path: "Daily/2026-05-08.md",
      content: "body\n",
      template: "Daily",
      overwrite: false,
    },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(recorded[0]!.argv).toContain("content=body\n");
  expect(recorded[0]!.argv).toContain("template=Daily");
});
