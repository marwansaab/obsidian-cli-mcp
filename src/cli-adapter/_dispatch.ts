// Original — no upstream. dispatchCli: the single spawn-and-collect primitive owning argv assembly, four-priority classification, always-on bounds, atomic in-flight registry, and failure-only stderr logging (ADR-007, FR-008..FR-018a).
import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fsPromises from "node:fs/promises";
import * as os from "node:os";

import { resolveBinary, type ResolutionAttempt } from "../binary-resolver/binary-resolver.js";
import { UpstreamError } from "../errors.js";

import type { Logger } from "../logger.js";

export const SIGKILL_GRACE_MS = 2_000;

export type SpawnLike = (binary: string, args: string[], options: SpawnOptions) => ChildProcess;

export interface DispatchInput {
  command: string;
  vault?: string;
  parameters?: Record<string, string | number | boolean | undefined>;
  flags?: string[];
  copy?: boolean;
  timeoutMs: number;
  outputCapBytes: number;
}

export interface DispatchOutput {
  stdout: string;
  stderr: string;
  exitCode: 0;
  argv: string[];
}

export type ResolveBinaryFn = typeof resolveBinary;

export interface DispatchDeps {
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
  logger: Logger;
  /**
   * Test seam (per binary-resolver contract): substitute a synchronous-resolving
   * stub so timing-sensitive tests (`vi.useFakeTimers`, microtask-counting kills,
   * etc.) don't race against the production resolver's real `fs.access` I/O.
   * Defaults to the production three-tier resolver in `binary-resolver/`.
   */
  resolveBinary?: ResolveBinaryFn;
}

interface InFlightContext {
  callId: string;
  command: string;
  startedAt: number;
  logger: Logger;
}

let inFlightChild: ChildProcess | null = null;
let inFlightContext: InFlightContext | null = null;

type KillReason =
  | { kind: "timeout" }
  | { kind: "cap"; stream: "stdout" | "stderr"; capturedBytes: number };

export function assembleArgv(input: DispatchInput, binary: string): string[] {
  const vaultPrefix = input.vault !== undefined ? [`vault=${input.vault}`] : [];
  const kvs = Object.entries(input.parameters ?? {})
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${String(v)}`);
  const flags = input.flags ?? [];
  const copySuffix = input.copy ? ["--copy"] : [];
  return [binary, ...vaultPrefix, input.command, ...kvs, ...flags, ...copySuffix];
}

function settlePathAttempt(
  attempts: ResolutionAttempt[],
  outcome: "resolved" | "not-found",
): ResolutionAttempt[] {
  // Trailing PATH attempt is settled by the dispatch layer once the spawn outcome is known
  // (resolver returns it as "pending"). Per Q1: PATH lookup is deferred to the OS spawn.
  const last = attempts[attempts.length - 1];
  if (last?.source === "PATH" && last.outcome === "pending") {
    return [...attempts.slice(0, -1), { source: "PATH", path: last.path, outcome }];
  }
  return attempts;
}

export async function dispatchCli(input: DispatchInput, deps: DispatchDeps): Promise<DispatchOutput> {
  const env = deps.env ?? process.env;
  const resolveBinaryFn = deps.resolveBinary ?? resolveBinary;
  const resolved = await resolveBinaryFn({
    env,
    platform: process.platform,
    homedir: os.homedir,
    access: fsPromises.access,
  });
  const binary = resolved.path;
  const argv = assembleArgv(input, binary);
  const spawnArgs = argv.slice(1);
  const spawnFn = deps.spawnFn ?? nodeSpawn;
  const callId = randomUUID();
  const startedAt = Date.now();

  return new Promise<DispatchOutput>((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawnFn(binary, spawnArgs, {
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      // Atomic registry insertion (FR-015a / Q5): synchronous with spawn(),
      // BEFORE any await or microtask boundary. Both cells set together so
      // killInFlightChildren() can read context for its dispatch.kill emission.
      inFlightChild = child;
      inFlightContext = { callId, command: input.command, startedAt, logger: deps.logger };
    } catch (err: unknown) {
      const errnoCode = (err as NodeJS.ErrnoException).code;
      if (errnoCode === "ENOENT") {
        reject(
          new UpstreamError({
            code: "CLI_BINARY_NOT_FOUND",
            cause: err,
            details: {
              platform: process.platform,
              attempts: settlePathAttempt(resolved.attempts, "not-found"),
              PATH: env.PATH,
            },
          }),
        );
        return;
      }
      reject(err);
      return;
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let killReason: KillReason | null = null;
    let sigkillTimer: NodeJS.Timeout | null = null;
    let settled = false;

    function clearRegistryIfMine(): void {
      if (inFlightChild === child) {
        inFlightChild = null;
        inFlightContext = null;
      }
    }

    function scheduleSigkill(): void {
      sigkillTimer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          /* already dead */
        }
      }, SIGKILL_GRACE_MS);
      sigkillTimer.unref?.();
    }

    function killChild(reason: KillReason): void {
      if (killReason || settled) return;
      killReason = reason;
      try {
        child.kill("SIGTERM");
      } catch {
        /* already dead */
      }
      scheduleSigkill();
    }

    const timeoutTimer = setTimeout(() => killChild({ kind: "timeout" }), input.timeoutMs);
    timeoutTimer.unref?.();

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > input.outputCapBytes && !killReason) {
        stdoutChunks.push(chunk);
        killChild({ kind: "cap", stream: "stdout", capturedBytes: stdoutBytes });
        return;
      }
      stdoutChunks.push(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes > input.outputCapBytes && !killReason) {
        stderrChunks.push(chunk);
        killChild({ kind: "cap", stream: "stderr", capturedBytes: stderrBytes });
        return;
      }
      stderrChunks.push(chunk);
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearRegistryIfMine();
      clearTimeout(timeoutTimer);
      if (sigkillTimer) clearTimeout(sigkillTimer);
      if (err.code === "ENOENT") {
        reject(
          new UpstreamError({
            code: "CLI_BINARY_NOT_FOUND",
            cause: err,
            details: {
              platform: process.platform,
              attempts: settlePathAttempt(resolved.attempts, "not-found"),
              PATH: env.PATH,
            },
          }),
        );
        return;
      }
      reject(err);
    });

    function onTerminal(code: number | null, signal: NodeJS.Signals | null): void {
      if (settled) return;
      settled = true;
      clearRegistryIfMine();
      clearTimeout(timeoutTimer);
      if (sigkillTimer) clearTimeout(sigkillTimer);
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      const durationMs = Date.now() - startedAt;
      const pid = child.pid ?? -1;

      // Bounds-fired classifications come first — they observed the kill before exit.
      if (killReason?.kind === "timeout") {
        deps.logger.dispatchTimeout({
          callId,
          command: input.command,
          pid,
          timeoutMs: input.timeoutMs,
          durationMs,
        });
        reject(
          new UpstreamError({
            code: "CLI_TIMEOUT",
            cause: null,
            details: {
              argv,
              timeoutMs: input.timeoutMs,
              partialStdout: stdout,
              partialStderr: stderr,
            },
          }),
        );
        return;
      }
      if (killReason?.kind === "cap") {
        const sourceChunks = killReason.stream === "stdout" ? stdoutChunks : stderrChunks;
        const partialBuffer = Buffer.concat(sourceChunks).subarray(0, input.outputCapBytes);
        const partial = partialBuffer.toString("utf8");
        deps.logger.dispatchCap({
          callId,
          command: input.command,
          pid,
          stream: killReason.stream,
          capturedBytes: killReason.capturedBytes,
          limitBytes: input.outputCapBytes,
        });
        reject(
          new UpstreamError({
            code: "CLI_OUTPUT_TOO_LARGE",
            cause: null,
            details: {
              argv,
              stream: killReason.stream,
              limitBytes: input.outputCapBytes,
              capturedBytes: killReason.capturedBytes,
              partial,
            },
          }),
        );
        return;
      }

      // Priority (a): non-zero exit (or signal-only termination via code === null → exitCode -1 sentinel).
      if (code !== 0) {
        const exitCode = code ?? -1;
        reject(
          new UpstreamError({
            code: "CLI_NON_ZERO_EXIT",
            cause: { exitCode, signal },
            details: { argv, command: input.command, stdout, stderr, exitCode, signal },
          }),
        );
        return;
      }

      const trimmedHead = stdout.trimStart();

      // Priority (b): ERR_NO_ACTIVE_FILE — exit 0 with stdout starting with the canonical
      // phrase, case-insensitive (BI-041 FR-001). Upstream emits the capital-N canonical
      // form `"Error: No active file."` on `delete` / `rename` / `outline`; older lowercase
      // fixtures keep matching (monotonic widening). Anchor stays at the message head —
      // substring-anywhere matches are rejected by the prefix invariant. Must precede
      // priority (c).
      if (trimmedHead.toLowerCase().startsWith("error: no active file")) {
        const message = stdout.split("\n", 1)[0]!.trim();
        reject(
          new UpstreamError({
            code: "ERR_NO_ACTIVE_FILE",
            cause: null,
            details: { argv, command: input.command, stdout, stderr, exitCode: 0, message },
            message:
              'No active file in Obsidian. Open a note in the editor, or call this tool with target_mode: "specific" and an explicit vault/file.',
          }),
        );
        return;
      }

      // Priority (c): CLI_REPORTED_ERROR — exit 0 with stdout starting with `Error:` (any other suffix).
      if (trimmedHead.startsWith("Error:")) {
        const message = stdout.split("\n", 1)[0]!.trim();
        reject(
          new UpstreamError({
            code: "CLI_REPORTED_ERROR",
            cause: null,
            details: { argv, command: input.command, stdout, stderr, exitCode: 0, message },
          }),
        );
        return;
      }

      // Priority (d): success.
      resolve({ stdout, stderr, exitCode: 0, argv });
    }

    // Listen on both `exit` and `close` so the primitive works with stub spawns
    // (which historically emit `close` only) and with real child processes
    // (which emit `exit` first, then `close`). The settled guard ensures we
    // classify exactly once.
    child.on("exit", onTerminal);
    child.on("close", onTerminal);
  });
}

export function killInFlightChildren(): boolean {
  if (!inFlightChild || !inFlightContext) return false;
  const child = inFlightChild;
  const ctx = inFlightContext;
  const pid = child.pid ?? -1;
  try {
    child.kill("SIGTERM");
  } catch {
    /* already dead */
  }
  setTimeout(() => {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already dead */
    }
  }, SIGKILL_GRACE_MS).unref?.();
  ctx.logger.dispatchKill({
    callId: ctx.callId,
    command: ctx.command,
    pid,
    durationMs: Date.now() - ctx.startedAt,
  });
  return true;
}

/** Test-only: reset the module-level registry between tests. Not part of the public API. */
export function __resetInFlightRegistryForTests(): void {
  inFlightChild = null;
  inFlightContext = null;
}
