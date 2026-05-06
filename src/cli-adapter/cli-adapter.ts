// Original — no upstream. invokeCli typed-tool facade: target-mode locator strip + queue-wrapped routing through dispatchCli with fixed 10 s / 10 MiB bounds (ADR-007, FR-013).
import { dispatchCli, killInFlightChildren, type DispatchInput, type SpawnLike } from "./_dispatch.js";
import { UpstreamError } from "../errors.js";

import type { Logger } from "../logger.js";
import type { Queue } from "../queue.js";

export type TargetMode = "specific" | "active";

export const TYPED_TOOL_TIMEOUT_MS = 10_000;
export const TYPED_TOOL_OUTPUT_CAP_BYTES = 10 * 1024 * 1024;

export interface InvokeCliInput {
  command: string;
  parameters: Record<string, string | number | boolean | undefined>;
  flags: string[];
  target_mode: TargetMode;
  copy?: boolean;
}

export interface InvokeCliSuccess {
  stdout: string;
  stderr: string;
}

export interface InvokeCliDeps {
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
  logger: Logger;
  queue: Queue;
}

export { UpstreamError, killInFlightChildren };
export type { SpawnLike };

const TARGET_LOCATOR_KEYS = new Set(["vault", "file", "path"]);

function stripTargetLocators(
  parameters: Record<string, string | number | boolean | undefined>,
): Record<string, string | number | boolean | undefined> {
  const stripped: Record<string, string | number | boolean | undefined> = {};
  for (const [k, v] of Object.entries(parameters)) {
    if (!TARGET_LOCATOR_KEYS.has(k)) stripped[k] = v;
  }
  return stripped;
}

export function invokeCli(input: InvokeCliInput, deps: InvokeCliDeps): Promise<InvokeCliSuccess> {
  const params = input.target_mode === "active" ? stripTargetLocators(input.parameters) : input.parameters;
  // Extract vault from parameters into DispatchInput.vault so dispatchCli's
  // argv assembly produces the documented [binary, vault=..., command, kvs...]
  // order (FR-012). Typed tools receive vault as a parameter today, not as a
  // separate field.
  const { vault, ...rest } = params as { vault?: unknown } & Record<string, string | number | boolean | undefined>;
  const dispatchInput: DispatchInput = {
    command: input.command,
    vault: typeof vault === "string" ? vault : undefined,
    parameters: rest,
    flags: input.flags,
    copy: input.copy ?? false,
    timeoutMs: TYPED_TOOL_TIMEOUT_MS,
    outputCapBytes: TYPED_TOOL_OUTPUT_CAP_BYTES,
  };
  return deps.queue.run(async () => {
    const out = await dispatchCli(dispatchInput, {
      spawnFn: deps.spawnFn,
      env: deps.env,
      logger: deps.logger,
    });
    return { stdout: out.stdout, stderr: out.stderr };
  });
}
