// Original — no upstream. obsidian_exec handler: argv assembly, spawn-and-collect, timeout, output cap, error mapping.
import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { randomUUID } from "node:crypto";
import { UpstreamError } from "../../errors.js";
import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";
import type { ObsidianExecInput } from "./schema.js";

export const DEFAULT_TIMEOUT_MS = 30_000;
export const SIGKILL_GRACE_MS = 2_000;
export const OUTPUT_CAP_BYTES = 10 * 1024 * 1024;

export interface ObsidianExecOutput {
  stdout: string;
  stderr: string;
  exitCode: 0;
  argv: string[];
}

export type SpawnLike = (binary: string, args: string[], options: SpawnOptions) => ChildProcess;

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

let activeChild: ChildProcess | null = null;

export function killActiveChild(): boolean {
  if (!activeChild) return false;
  const child = activeChild;
  try {
    child.kill("SIGTERM");
  } catch {
    /* child may already be dead */
  }
  setTimeout(() => {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already dead */
    }
  }, SIGKILL_GRACE_MS).unref?.();
  return true;
}

export function executeObsidianExec(input: ObsidianExecInput, deps: ExecuteDeps): Promise<ObsidianExecOutput> {
  return deps.queue.run(() => runOnce(input, deps));
}

type KillReason =
  | { kind: "timeout" }
  | { kind: "cap"; stream: "stdout" | "stderr"; capturedBytes: number };

function runOnce(input: ObsidianExecInput, deps: ExecuteDeps): Promise<ObsidianExecOutput> {
  const env = deps.env ?? process.env;
  const binary = env.OBSIDIAN_BIN ?? "obsidian";
  const spawnArgs = assembleSpawnArgs(input);
  const argv = [binary, ...spawnArgs];
  const callId = randomUUID();
  const spawnFn = deps.spawnFn ?? nodeSpawn;
  const startedAt = Date.now();
  const effectiveTimeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const queueDepth = Math.max(0, deps.queue.depth() - 1);
  deps.logger.callStart({ callId, command: input.command, vault: input.vault ?? null, argv, queueDepth });

  return new Promise<ObsidianExecOutput>((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawnFn(binary, spawnArgs, {
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (err: unknown) {
      const errnoCode = (err as NodeJS.ErrnoException).code;
      if (errnoCode === "ENOENT") {
        const e = new UpstreamError({
          code: "CLI_BINARY_NOT_FOUND",
          cause: err,
          details: { binaryAttempted: binary, PATH: env.PATH },
        });
        deps.logger.callEndFailure({ callId, errorCode: "CLI_BINARY_NOT_FOUND", durationMs: Date.now() - startedAt });
        reject(e);
        return;
      }
      reject(err);
      return;
    }

    activeChild = child;
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let killReason: KillReason | null = null;
    let sigkillTimer: NodeJS.Timeout | null = null;
    let settled = false;

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

    const timeoutTimer = setTimeout(() => killChild({ kind: "timeout" }), effectiveTimeoutMs);
    timeoutTimer.unref?.();

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > OUTPUT_CAP_BYTES && !killReason) {
        stdoutChunks.push(chunk);
        killChild({ kind: "cap", stream: "stdout", capturedBytes: stdoutBytes });
        return;
      }
      stdoutChunks.push(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes > OUTPUT_CAP_BYTES && !killReason) {
        stderrChunks.push(chunk);
        killChild({ kind: "cap", stream: "stderr", capturedBytes: stderrBytes });
        return;
      }
      stderrChunks.push(chunk);
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      activeChild = null;
      clearTimeout(timeoutTimer);
      if (sigkillTimer) clearTimeout(sigkillTimer);
      if (err.code === "ENOENT") {
        const e = new UpstreamError({
          code: "CLI_BINARY_NOT_FOUND",
          cause: err,
          details: { binaryAttempted: binary, PATH: env.PATH },
        });
        deps.logger.callEndFailure({ callId, errorCode: "CLI_BINARY_NOT_FOUND", durationMs: Date.now() - startedAt });
        reject(e);
        return;
      }
      reject(err);
    });

    child.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      activeChild = null;
      clearTimeout(timeoutTimer);
      if (sigkillTimer) clearTimeout(sigkillTimer);
      const stdoutFull = Buffer.concat(stdoutChunks).toString("utf8");
      const stderrFull = Buffer.concat(stderrChunks).toString("utf8");
      const durationMs = Date.now() - startedAt;

      if (killReason?.kind === "timeout") {
        deps.logger.callEndFailure({ callId, errorCode: "CLI_TIMEOUT", durationMs });
        reject(
          new UpstreamError({
            code: "CLI_TIMEOUT",
            cause: null,
            details: {
              argv,
              timeoutMs: effectiveTimeoutMs,
              partialStdout: stdoutFull,
              partialStderr: stderrFull,
            },
          }),
        );
        return;
      }

      if (killReason?.kind === "cap") {
        const sourceChunks = killReason.stream === "stdout" ? stdoutChunks : stderrChunks;
        const partialBuffer = Buffer.concat(sourceChunks).subarray(0, OUTPUT_CAP_BYTES);
        const partial = partialBuffer.toString("utf8");
        deps.logger.callEndFailure({ callId, errorCode: "CLI_OUTPUT_TOO_LARGE", durationMs });
        reject(
          new UpstreamError({
            code: "CLI_OUTPUT_TOO_LARGE",
            cause: null,
            details: {
              argv,
              stream: killReason.stream,
              limitBytes: OUTPUT_CAP_BYTES,
              capturedBytes: killReason.capturedBytes,
              partial,
            },
          }),
        );
        return;
      }

      if (code === 0) {
        deps.logger.callEndSuccess({ callId, durationMs, stdoutBytes, stderrBytes });
        resolve({ stdout: stdoutFull, stderr: stderrFull, exitCode: 0, argv });
        return;
      }
      const exitCode = code ?? -1;
      deps.logger.callEndFailure({ callId, errorCode: "CLI_NON_ZERO_EXIT", durationMs, exitCode, signal });
      reject(
        new UpstreamError({
          code: "CLI_NON_ZERO_EXIT",
          cause: { exitCode, signal },
          details: { argv, stdout: stdoutFull, stderr: stderrFull },
        }),
      );
    });
  });
}

function assembleSpawnArgs(input: ObsidianExecInput): string[] {
  const params = input.parameters ?? {};
  const kvParams = Object.entries(params).map(([k, v]) => `${k}=${String(v)}`);
  const vaultPrefix = input.vault ? [`vault=${input.vault}`] : [];
  const flagsSuffix = input.flags ?? [];
  const copySuffix = input.copy ? ["--copy"] : [];
  return [...vaultPrefix, input.command, ...kvParams, ...flagsSuffix, ...copySuffix];
}
