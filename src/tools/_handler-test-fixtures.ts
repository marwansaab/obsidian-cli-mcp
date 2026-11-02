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
//
// Spec 080: both factories are answer-tag aware. When the spawn's `code=` argument carries the
// typed-eval wrapper, every string-stdout line starting `=> ` is tagged with that call's tag, so
// fixtures written as `=> {…}` keep working; a function-form `stdout` receives the tag and is
// emitted verbatim, for tests that need exact bytes (noise, look-alikes).
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";

import { type SpawnLike } from "../cli-adapter/_dispatch.js";
import { ANSWER_TAG_PREFIX, EVAL_ANSWER_PREFIX, wrapEvalCode } from "../cli-adapter/_eval-answer.js";
import { createLogger, type Logger } from "../logger.js";
import { confirmFromResponse } from "./_confirm.js";

import type { Confirmation } from "./_shared.js";
import type { VaultRegistry } from "../vault-registry/registry.js";

/** Spawn stdout: literal text (tagged on a wrapped eval), or a function of the call's answer tag emitted verbatim. */
export type StubStdout = string | ((ctx: { answerTag?: string }) => string);

// The wrapper's fixed parts, taken from wrapEvalCode itself so this parser cannot drift from it.
const [WRAPPED_CODE_HEAD, WRAPPED_CODE_TAG_END, WRAPPED_CODE_TAIL] = wrapEvalCode("\u0000", "\u0000").split("\u0000") as [
  string,
  string,
  string,
];

/** The answer tag in a spawn's `code=` argument, or `undefined` when the code is not wrapped. */
export function answerTagFromArgv(argv: string[]): string | undefined {
  const head = `code=${WRAPPED_CODE_HEAD}${ANSWER_TAG_PREFIX}`;
  const arg = argv.find((a) => a.startsWith(head));
  if (arg === undefined) return undefined;
  const end = arg.indexOf(WRAPPED_CODE_TAG_END);
  return end < 0 ? undefined : arg.slice(`code=${WRAPPED_CODE_HEAD}`.length, end);
}

/** The answer line a wrapped eval prints for `body`. */
export function answerLine(tag: string, body: string): string {
  return `${EVAL_ANSWER_PREFIX}<<${tag}>>${body}`;
}

/** The original code inside a wrapped `code=` argument (with or without the `code=` prefix); other input is returned unchanged. */
export function unwrapEvalCode(codeArg: string): string {
  const code = codeArg.startsWith("code=") ? codeArg.slice("code=".length) : codeArg;
  const tagEnd = code.indexOf(WRAPPED_CODE_TAG_END);
  if (!code.startsWith(WRAPPED_CODE_HEAD) || tagEnd < 0 || !code.endsWith(WRAPPED_CODE_TAIL)) return codeArg;
  return code.slice(tagEnd + WRAPPED_CODE_TAG_END.length, -WRAPPED_CODE_TAIL.length);
}

/** Rewrites the (already tagged) string stdout of a wrapped eval spawn. */
export type TaggedStdoutTransform = (stdout: string, answerTag: string) => string;

let taggedStdoutTransform: TaggedStdoutTransform | undefined;

/**
 * Test hook: while `run` is pending, rewrite the (already tagged) string stdout of every wrapped eval
 * spawn, e.g. to put plugin noise around the answer. Scoped so it cannot leak into a later test: it
 * is cleared when `run` settles, and a nested call is refused.
 */
export async function withTaggedStdoutTransform<T>(transform: TaggedStdoutTransform, run: () => Promise<T>): Promise<T> {
  if (taggedStdoutTransform !== undefined) throw new Error("withTaggedStdoutTransform calls do not nest");
  taggedStdoutTransform = transform;
  try {
    return await run();
  } finally {
    taggedStdoutTransform = undefined;
  }
}

/**
 * The stdout a stub child emits for `argv`: a function-form `stdout` receives the call's answer tag
 * and is emitted verbatim; on a wrapped eval, string stdout has every line starting `=> ` tagged with
 * the call's tag (then any {@link withTaggedStdoutTransform} rewrite applies); otherwise unchanged.
 */
export function renderStubStdout(stdout: StubStdout | undefined, argv: string[]): string | undefined {
  if (stdout === undefined) return undefined;
  const answerTag = answerTagFromArgv(argv);
  if (typeof stdout === "function") return stdout({ answerTag });
  if (answerTag === undefined) return stdout;
  const tagged = stdout
    .split("\n")
    .map((line) => (line.startsWith(EVAL_ANSWER_PREFIX) ? answerLine(answerTag, line.slice(EVAL_ANSWER_PREFIX.length)) : line))
    .join("\n");
  return taggedStdoutTransform ? taggedStdoutTransform(tagged, answerTag) : tagged;
}

/** A single queued spawn response for {@link makeQueuedSpawn}. */
export interface StubResponse {
  stdout?: StubStdout;
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
  stdout?: StubStdout;
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
    const stdout = renderStubStdout(spec.stdout, argv);
    setImmediate(() => {
      if (stdout) child.stdout.push(Buffer.from(stdout, "utf8"));
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
    const stdout = renderStubStdout(spec.stdout, argv);
    setImmediate(() => {
      if (spec.chunkedStdout) {
        for (const chunk of spec.chunkedStdout) child.stdout.push(chunk);
      } else if (stdout) {
        child.stdout.push(Buffer.from(stdout, "utf8"));
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

/** The focused-file eval reply (FOCUSED_FILE_TEMPLATE): `relPath` (or no focused file) in the vault at `base`. */
export function focusedFileResponse(relPath: string | null, base = "/vaults/MyVault"): StubResponse {
  return { stdout: `=> ${JSON.stringify({ path: relPath, base })}\n`, exitCode: 0 };
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

/** The value of the first recorded argv token `key=<value>`, or undefined when no such token was sent. */
export function findKv(argv: string[], key: string): string | undefined {
  const prefix = `${key}=`;
  const hit = argv.find((a) => a.startsWith(prefix));
  return hit === undefined ? undefined : hit.slice(prefix.length);
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
