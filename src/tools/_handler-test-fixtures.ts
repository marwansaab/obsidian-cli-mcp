// Original — no upstream. Shared handler-test fixtures (BI-058 F-A/F-B): the
// spawn-stub factories, silent + capturing loggers, and rejection-capture helper that ~30
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
import { type InvokeCliDeps } from "../cli-adapter/cli-adapter.js";
import { evalAnswerTag, wrapEvalCode } from "../cli-adapter/eval-output.js";
import { createLogger, type Logger } from "../logger.js";
import { confirmFromResponse } from "./_confirm.js";

import type { Confirmation } from "./_shared.js";
import type { VaultRegistry } from "../vault-registry/registry.js";

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

/** A vault registry knowing one vault (`name` at `root`), with the reverse display-name lookup. */
export function stubVaultRegistry(name: string, root: string): VaultRegistry {
  return {
    resolveVaultPath: async () => root,
    resolveVaultDisplayName: (base) => (base === root ? name : null),
  };
}

/** The `obsidian file file=<name>` TSV reply resolving to `relPath` (the `resolveFileByTsv` round-trip). */
export function fileTsvResponse(relPath: string): StubResponse {
  return { stdout: `path\t${relPath}\nname\tx\n`, exitCode: 0 };
}

/** The eval answer-tag nonce handler tests inject through the `evalNonce` deps seam (spec 080). */
export const TEST_EVAL_NONCE = "00000000-0000-4000-8000-000000000080";

/** The answer tag `invokeEval` wraps eval code with when `evalNonce` returns {@link TEST_EVAL_NONCE}. */
export const TEST_EVAL_TAG = evalAnswerTag(TEST_EVAL_NONCE);

/**
 * The `evalNonce` seam returning {@link TEST_EVAL_NONCE}, to spread into a handler's or tool's deps.
 * It is an `InvokeCliDeps` test seam (like `resolveBinary` / `launchFn`): handlers pass their deps
 * whole to `invokeEval`, so the spread field reaches it as passed.
 */
export const EVAL_NONCE_SEAM: Pick<InvokeCliDeps, "evalNonce"> = { evalNonce: (): string => TEST_EVAL_NONCE };

/** The line Obsidian prints for an eval whose tagged answer is `value` (no trailing newline). */
export function evalAnswerLine(value: string): string {
  return `=> ${TEST_EVAL_TAG}${value}`;
}

/** The `code=` value `invokeEval` spawns for eval `code` under {@link TEST_EVAL_NONCE}. */
export function wrappedEvalCode(code: string): string {
  return wrapEvalCode(code, TEST_EVAL_TAG);
}

/** Plugin output printed before an eval's answer line (spec 080 test vocabulary). */
export const NOISE_BEFORE = "Found and returned 3 smart_blocks.\n[warn] plugin x: cache warm\n\n";

/** Plugin output printed after an eval's answer line. */
export const NOISE_AFTER = "\nplugin y: done";

/** Plugin output no known plugin prints. */
export const INVENTED = "§§ zz-unknown-plugin ¤ 42 :: {not json} [[x]]\n";

/** Plugin output with no answer line at all. */
export const NO_ANSWER = "plugin z: starting\nplugin z: ready\n";

/** {@link NO_ANSWER} padded past the 500-character bounded `details.stdout`. */
export const LONG_NO_ANSWER = NO_ANSWER + "x".repeat(600);

/** An untagged look-alike answer line carrying `value` — never this call's answer. */
export function lookalike(value: string): string {
  return `=> ${value}`;
}

/** One eval output of the spec 080 plugin-noise battery. */
export interface PluginNoiseCase {
  name: string;
  stdout: string;
}

/**
 * Spec 080 battery, as data: outputs that carry the tagged `answer` among plugin output. Each eval
 * suite runs them against its own handler (SC-001 / SC-002 hold per capability) and expects the
 * result of `answer` alone. `decoy` is a different, valid answer carried by the look-alike lines,
 * so a look-alike that won would change the result.
 */
export function noisyAnswerCases(answer: string, decoy: string): PluginNoiseCase[] {
  return [
    { name: "US1: plugin lines before the answer", stdout: `${NOISE_BEFORE}${evalAnswerLine(answer)}\n` },
    { name: "US4: plugin output after the answer", stdout: `${evalAnswerLine(answer)}${NOISE_AFTER}\n` },
    {
      name: "US3: look-alikes before and after the answer never win",
      stdout: `${lookalike(decoy)}\n${evalAnswerLine(answer)}\n${lookalike(decoy)}\n`,
    },
    { name: "US5: invented plugin output around the answer", stdout: `${INVENTED}${evalAnswerLine(answer)}\n${INVENTED}` },
  ];
}

/** A {@link noAnswerCases} output, with the bounded raw-output `details` a 500-character excerpt carries (FR-014). */
export interface NoAnswerCase extends PluginNoiseCase {
  excerpt: { stdout: string; stdoutTail?: string };
}

/**
 * Spec 080 battery, as data: outputs that carry no answer for this call (US3). Each must fail at
 * the suite's json-parse stage with its raw output: `stdout` for a tool that keeps the whole output,
 * `excerpt` for one that bounds it at 500 characters.
 */
export function noAnswerCases(decoy: string): NoAnswerCase[] {
  const alone = `${NO_ANSWER}${lookalike(decoy)}`;
  return [
    { name: "US3: a look-alike alone", stdout: alone, excerpt: { stdout: alone } },
    { name: "US3: no answer", stdout: NO_ANSWER, excerpt: { stdout: NO_ANSWER } },
    {
      name: "US3: long output with no answer",
      stdout: LONG_NO_ANSWER,
      excerpt: { stdout: LONG_NO_ANSWER.slice(0, 500), stdoutTail: LONG_NO_ANSWER.slice(-500) },
    },
  ];
}

/** The focused-file eval reply (FOCUSED_FILE_TEMPLATE): `relPath` (or no focused file) in the vault at `base`. */
export function focusedFileResponse(relPath: string | null, base = "/vaults/MyVault"): StubResponse {
  return { stdout: `${evalAnswerLine(JSON.stringify({ path: relPath, base }))}\n`, exitCode: 0 };
}

/** The shim's answer for a registered vault that is not open yet (ADR-029 cold start), for subcommand `command`. */
export function coldStartResponse(command: string): StubResponse {
  return { stdout: `Error: Command "${command}" not found. It may require a plugin to be enabled.\n`, exitCode: 0 };
}

/** A Logger whose output is discarded — for handler tests that never assert logs. */
export function silentLogger(): Logger {
  return createLogger({ stream: new Writable({ write(_c, _e, cb) { cb(); } }) });
}

/** A Logger that parses every emitted JSON line into `events` — for handler tests that assert logs. */
export function captureLogger(events: Array<Record<string, unknown>>): Logger {
  return createLogger({
    stream: new Writable({
      write(chunk, _enc, cb) {
        try {
          events.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
        } catch {
          /* ignore */
        }
        cb();
      },
    }),
  });
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

/**
 * The `Confirmation` of a call to `toolName` whose client can confirm and whose human gave
 * `answer` (068 R12): it runs the real `confirmFromResponse` against a request carrying that
 * answer. Omit `answer` for "already accepted with confirm: true".
 */
export function answeredCall(
  toolName: string,
  answer: { action: "accept" | "decline" | "cancel"; content?: Record<string, unknown> } = {
    action: "accept",
    content: { confirm: true },
  },
): Confirmation {
  return {
    requireConfirmable: () => undefined,
    confirm: (message) => confirmFromResponse({ confirm: answer }, toolName, message),
  };
}
