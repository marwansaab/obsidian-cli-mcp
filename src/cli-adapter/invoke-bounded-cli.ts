// Original — no upstream. invokeBoundedCli escape-hatch facade: queue-wrapped dispatch with default 30 s / 10 MiB; the timeoutMs override is bounded at 120 s by the obsidian_exec schema (ADR-007, FR-011). 068 R11: the per-call signal and progress reporter pass to the queue and to dispatchCli.
import {
  dispatchCli,
  type CallScope,
  type DispatchInput,
  type DispatchOutput,
  type LaunchFn,
  type ResolveBinaryFn,
  type SpawnLike,
} from "./_dispatch.js";

import type { Logger } from "../logger.js";
import type { Queue } from "../queue.js";

export const OBSIDIAN_EXEC_DEFAULT_TIMEOUT_MS = 30_000;
export const OBSIDIAN_EXEC_OUTPUT_CAP_BYTES = 10 * 1024 * 1024;
export const OBSIDIAN_EXEC_MAX_TIMEOUT_MS = 120_000;

export interface InvokeBoundedCliInput {
  command: string;
  parameters?: Record<string, string | number | boolean | undefined>;
  vault?: string;
  flags?: string[];
  copy?: boolean;
}

export interface InvokeBoundedCliOverrides {
  timeoutMs?: number;
}

export interface InvokeBoundedCliOutput {
  stdout: string;
  stderr: string;
  exitCode: 0;
  argv: string[];
}

export interface InvokeBoundedCliDeps extends CallScope {
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
  logger: Logger;
  queue: Queue;
  /** Test seam — passes through to dispatchCli. See DispatchDeps.resolveBinary. */
  resolveBinary?: ResolveBinaryFn;
  /** Test seam — passes through to dispatchCli's BI-060 recovery. See DispatchDeps.launchFn. */
  launchFn?: LaunchFn;
}

export type { CallScope, LaunchFn, ResolveBinaryFn, SpawnLike };

export function invokeBoundedCli(
  input: InvokeBoundedCliInput,
  overrides: InvokeBoundedCliOverrides,
  deps: InvokeBoundedCliDeps,
): Promise<InvokeBoundedCliOutput> {
  // The obsidian_exec schema refuses a timeoutMs above OBSIDIAN_EXEC_MAX_TIMEOUT_MS, so the
  // override needs no clamp here (068 R11).
  const timeoutMs = overrides.timeoutMs ?? OBSIDIAN_EXEC_DEFAULT_TIMEOUT_MS;

  const dispatchInput: DispatchInput = {
    command: input.command,
    vault: input.vault,
    parameters: input.parameters ?? {},
    flags: input.flags ?? [],
    copy: input.copy ?? false,
    timeoutMs,
    outputCapBytes: OBSIDIAN_EXEC_OUTPUT_CAP_BYTES,
  };

  return deps.queue.run(async () => {
    const out: DispatchOutput = await dispatchCli(dispatchInput, {
      spawnFn: deps.spawnFn,
      env: deps.env,
      logger: deps.logger,
      resolveBinary: deps.resolveBinary,
      launchFn: deps.launchFn,
      signal: deps.signal,
      reportProgress: deps.reportProgress,
    });
    return out;
  }, { signal: deps.signal });
}
