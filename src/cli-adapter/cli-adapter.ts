// Original — no upstream. invokeCli typed-tool facade: top-level vault field (symmetric with invokeBoundedCli per Code-5 / 2026-05-08), target-mode locator strip on parameters, queue-wrapped routing through dispatchCli with fixed 10 s / 10 MiB bounds (ADR-007, FR-013).
import { dispatchCli, killInFlightChildren, type DispatchInput, type SpawnLike } from "./_dispatch.js";
import { UpstreamError } from "../errors.js";

import type { Logger } from "../logger.js";
import type { Queue } from "../queue.js";

export type TargetMode = "specific" | "active";

export const TYPED_TOOL_TIMEOUT_MS = 10_000;
export const TYPED_TOOL_OUTPUT_CAP_BYTES = 10 * 1024 * 1024;

export interface InvokeCliInput {
  command: string;
  /**
   * Vault display name. Top-level field (matching `invokeBoundedCli`'s shape) so
   * both facades have symmetric public input contracts. In `target_mode: "active"`
   * the field is ignored; in `"specific"` it flows through to `dispatchCli`'s
   * argv prefix per the documented order [binary, vault=..., command, kvs...].
   */
  vault?: string;
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
  // Defence-in-depth strip in active mode: the typed-tool target_mode schema
  // already rejects vault/file/path at the boundary, but a hypothetical future
  // caller that constructs `parameters` less carefully gets the same protection
  // here. With vault now a top-level field, the strip primarily defends against
  // file/path leaking in via parameters (vault stripping is redundant but harmless).
  const parameters =
    input.target_mode === "active" ? stripTargetLocators(input.parameters) : input.parameters;
  const dispatchInput: DispatchInput = {
    command: input.command,
    vault: input.target_mode === "active" ? undefined : input.vault,
    parameters,
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
