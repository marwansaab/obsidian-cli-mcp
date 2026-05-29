// Original — no upstream. Shared handler-test fixtures (BI-058 F-A/F-B): the
// spawn-stub factories, silent logger, and rejection-capture helper that ~30
// src/tools/<name>/handler.test.ts files each defined as byte-identical copies.
//
// Lives in src/tools/ (not cli-adapter) so it imports SpawnLike *downward* per
// Principle I, mirroring _registration-stub.ts. Deliberately vitest-free: the
// build (tsconfig.build.json) only excludes *.test.ts, so this file compiles
// into dist as a harmless orphan (like _registration-stub.ts) — keeping `vi`
// out of it avoids shipping a devDependency import. Fixtures that need `vi`
// (e.g. a call-counted vault registry) stay local for now.
//
// Two spawn factories on purpose (they have different semantics):
//   - makeQueuedSpawn: consumes responses[idx++] and THROWS on overflow.
//   - makeStubSpawn:   single spec answers every spawn (no queue, no overflow).
// The cli-adapter trio keeps its own richer stub (emitErrno / child-in-recording).
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";

import { type SpawnLike } from "../cli-adapter/_dispatch.js";
import { createLogger, type Logger } from "../logger.js";

/** A single queued spawn response for {@link makeQueuedSpawn}. */
export interface StubResponse {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  errorOnSpawn?: unknown;
}

/**
 * The single-spec shape for {@link makeStubSpawn}. Superset of every tool-level
 * single-spec stub: `chunkedStdout` (read) and `hold` (read) are optional and
 * absent for delete/move/rename.
 */
export interface StubChildSpec {
  stdout?: string;
  stderr?: string;
  chunkedStdout?: Buffer[];
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  errorOnSpawn?: unknown;
  hold?: boolean;
}

/** What each spawn invocation records (argv is copied to defeat later mutation). */
export interface SpawnRecording {
  binary: string;
  argv: string[];
  options: SpawnOptions;
}

/** Default child pid — asserted as 4242 in cli-adapter/_dispatch.test.ts (I-1). */
const DEFAULT_PID = 4242;

function makeChild(pid: number): EventEmitter & {
  stdout: Readable;
  stderr: Readable;
  kill: (signal?: NodeJS.Signals) => boolean;
  pid?: number;
} {
  const child = new EventEmitter() as EventEmitter & {
    stdout: Readable;
    stderr: Readable;
    kill: (signal?: NodeJS.Signals) => boolean;
    pid?: number;
  };
  child.stdout = new Readable({ read() {} });
  child.stderr = new Readable({ read() {} });
  child.pid = pid;
  child.kill = (signal?: NodeJS.Signals) => {
    setImmediate(() => child.emit("exit", null, signal ?? "SIGTERM"));
    return true;
  };
  return child;
}

/**
 * Queue-semantics spawn stub: returns one child per call, consuming `responses`
 * in order, throwing once they are exhausted. Returns `getCount` for the spawn
 * tally so callers can assert a single-spawn invariant.
 */
export function makeQueuedSpawn(
  responses: StubResponse[],
  opts: { pid?: number } = {},
): { spawnFn: SpawnLike; recorded: SpawnRecording[]; getCount: () => number } {
  const recorded: SpawnRecording[] = [];
  let idx = 0;
  const spawnFn: SpawnLike = (binary, argv, options) => {
    const spec = responses[idx++];
    if (!spec) {
      throw new Error(
        `unexpected spawn invocation #${idx}; only ${responses.length} response(s) configured`,
      );
    }
    if (spec.errorOnSpawn) throw spec.errorOnSpawn;
    recorded.push({ binary, argv: [...argv], options });
    const child = makeChild(opts.pid ?? DEFAULT_PID);
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
  return { spawnFn, recorded, getCount: () => idx };
}

/**
 * Single-spec spawn stub: every spawn answers with the same `spec` (no queue).
 * Supports `chunkedStdout` (explicit chunks) and `hold` (never auto-exit — the
 * test forces exit via the child's `kill`).
 */
export function makeStubSpawn(
  spec: StubChildSpec,
  opts: { pid?: number } = {},
): { spawnFn: SpawnLike; recorded: SpawnRecording[] } {
  const recorded: SpawnRecording[] = [];
  const spawnFn: SpawnLike = (binary, argv, options) => {
    if (spec.errorOnSpawn) throw spec.errorOnSpawn;
    recorded.push({ binary, argv: [...argv], options });
    const child = makeChild(opts.pid ?? DEFAULT_PID);
    setImmediate(() => {
      if (spec.chunkedStdout) {
        for (const chunk of spec.chunkedStdout) child.stdout.push(chunk);
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

/** A Logger whose output is discarded — for handler tests that never assert logs. */
export function silentLogger(): Logger {
  return createLogger({ stream: new Writable({ write(_c, _e, cb) { cb(); } }) });
}

/** Await a promise expected to reject; return the rejection value (or throw if it resolves). */
export async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    throw new Error("expected rejection but promise resolved");
  } catch (e) {
    return e;
  }
}
