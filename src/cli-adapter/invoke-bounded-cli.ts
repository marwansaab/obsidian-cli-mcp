// Original — no upstream. invokeBoundedCli escape-hatch facade: queue-wrapped dispatch with default 30 s / 10 MiB and silent 120 s clamp on timeoutMs override (ADR-007, Q1 / FR-011).
import { dispatchCli, type DispatchInput, type DispatchOutput, type LaunchFn, type ResolveBinaryFn, type SpawnLike } from "./_dispatch.js";

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

export interface InvokeBoundedCliDeps {
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
  logger: Logger;
  queue: Queue;
  /** Test seam — passes through to dispatchCli. See DispatchDeps.resolveBinary. */
  resolveBinary?: ResolveBinaryFn;
  /** Test seam — passes through to dispatchCli's BI-060 recovery. See DispatchDeps.launchFn. */
  launchFn?: LaunchFn;
}

export type { LaunchFn, ResolveBinaryFn, SpawnLike };

export function invokeBoundedCli(
  input: InvokeBoundedCliInput,
  overrides: InvokeBoundedCliOverrides,
  deps: InvokeBoundedCliDeps,
): Promise<InvokeBoundedCliOutput> {
  const requested = overrides.timeoutMs ?? OBSIDIAN_EXEC_DEFAULT_TIMEOUT_MS;
  // Silent clamp at the ceiling per Clarifications 2026-05-07 Q1 / FR-011.
  // No VALIDATION_ERROR, no warning, no log emission on the clamp itself —
  // a downstream CLI_TIMEOUT log fires only if the call still hangs past the
  // clamped value.
  const timeoutMs = Math.min(requested, OBSIDIAN_EXEC_MAX_TIMEOUT_MS);

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
    });
    return out;
  });
}
